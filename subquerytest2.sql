create or alter procedure dbo.some_proc ( @param1 varchar(20), @param2 varchar(20))
as
begin
 select tbl1.col1, tbl2.col2, tbl1.col2 - tbl2.col3 as col4
 from ( select long_column_name_1, long_column_name_2, long_column_name_3 
 from some_long_table1) tbl1
 inner join ( select long_column_name_1, long_column_name_2, long_column_name_3 from some_long_table2) tbl2
 on tbl1.col1 = tbl2.col1
 order by 1
 
end
go
